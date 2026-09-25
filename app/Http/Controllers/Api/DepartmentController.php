<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\College;
use App\Models\Student;
use App\Models\StudentDocument;
use App\Models\Document;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    // GET /api/colleges
    public function index()
    {
        $totalRequired = Document::count();
        $colleges = College::with('programs')->withCount('students')->get();

        $colleges = $colleges->map(function ($college) use ($totalRequired) {
            $studentIds = Student::where('college_id', $college->college_id)->pluck('student_id');

            $documentsCount = StudentDocument::whereIn('student_id', $studentIds)
                ->where('status', 'Approved')
                ->count();

            $studentCount = $studentIds->count();
            $totalPossible = $totalRequired * $studentCount;

            $college->documents_count = $documentsCount;
            $college->completion = $totalPossible > 0
                ? round(($documentsCount / $totalPossible) * 100)
                : 0;

            return $college;
        });

        return response()->json($colleges);
    }

    // GET /api/colleges/{collegeId}/students
    public function students(Request $request, $collegeId)
    {
        $totalRequired = Document::count();

        $query = Student::where('college_id', $collegeId);

        if ($request->filled('program_id')) {
            $query->where('program_id', $request->program_id);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'ilike', "%$search%")
                  ->orWhere('last_name', 'ilike', "%$search%")
                  ->orWhere('student_id', 'ilike', "%$search%");
            });
        }

        $students = $query->get()->map(function ($s) use ($totalRequired) {
            $uploaded = StudentDocument::where('student_id', $s->student_id)
                ->where('status', 'Approved')
                ->count();

            $s->documents = $uploaded;
            $s->completion = $totalRequired > 0 ? round(($uploaded / $totalRequired) * 100) : 0;

            return $s;
        });

        return response()->json($students);
    }
}