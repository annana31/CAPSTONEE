<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class StudentController extends Controller
{
    public function createStudentFolder($student)
    {
        $studentName = trim(
            $student->first_name . ' ' .
            ($student->middle_name ?? '') . ' ' .
            $student->last_name
        );

        // Make the folder name safe for Windows
        $folderName = preg_replace(
            '/[<>:"\/\\\\|?*\x00-\x1F]/',
            '_',
            $studentName
        );

        $basePath = 'C:\\Users\\USER\\Documents\\student';
        $folderPath = $basePath . '\\' . $folderName;

        if (!File::isDirectory($folderPath)) {
            File::makeDirectory($folderPath, 0755, true);
        }

        return $folderPath;
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'student_id' => 'required|string',
            'first_name' => 'required|string|max:100',
            'middle_name' => 'nullable|string|max:100',
            'last_name' => 'required|string|max:100',
        ]);

        // Insert into your existing student table
        DB::table('tbl_student')->insert($validated);

        // Create a student object for the folder function
        $student = (object) $validated;

        $folderPath = $this->createStudentFolder($student);

        return response()->json([
            'message' => 'Student added and folder created successfully.',
            'folder_path' => $folderPath,
        ], 201);
    }
}