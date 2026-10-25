<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class StudentController extends Controller
{
    /**
     * Base folder for student folders on THIS computer.
     * Optional override in .env:  STUDENT_BASE_PATH="D:\SchoolRecords\student"
     */
    private function getBasePath(): string
    {
        $custom = env('STUDENT_BASE_PATH');
        if ($custom) {
            return rtrim($custom, '\\/');
        }

        // Windows: USERPROFILE, Linux/Mac: HOME
        $home = getenv('USERPROFILE') ?: getenv('HOME');

        if (!$home) {
            $home = ($_SERVER['HOMEDRIVE'] ?? '') . ($_SERVER['HOMEPATH'] ?? '');
        }

        if (!$home) {
            throw new \RuntimeException('Could not detect the user home folder.');
        }

        return rtrim($home, '\\/') . DIRECTORY_SEPARATOR . 'Documents' . DIRECTORY_SEPARATOR . 'student';
    }

    public function createStudentFolder($student)
    {
        $studentName = trim(
            $student->first_name . ' ' .
            ($student->middle_name ?? '') . ' ' .
            $student->last_name
        );
        $studentName = preg_replace('/\s+/', ' ', $studentName);

        // Make the folder name safe for Windows
        $folderName = preg_replace(
            '/[<>:"\/\\\\|?*\x00-\x1F]/',
            '_',
            $student->student_id . '_' . str_replace(' ', '_', $studentName)
        );
        $folderName = rtrim($folderName, '. ');

        $folderPath = $this->getBasePath() . DIRECTORY_SEPARATOR . $folderName;

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