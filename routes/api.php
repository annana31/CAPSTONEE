<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OcrController;
use App\Http\Controllers\Api\StaffController;
use App\Http\Controllers\Api\ReportsController;


Route::post('/ocr/extract', [OcrController::class, 'extract']);
/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

// STUDENT REQUEST
use App\Http\Controllers\RequestController;


Route::get('/request/student/{student_id}', [RequestController::class, 'getByStudent']);
Route::post('/request', [RequestController::class, 'store']);

Route::get('/student/{id}', function ($id) {
    $student = DB::table('tbl_student as s')
        ->leftJoin('tbl_program as p', 's.program_id', '=', 'p.program_id')
        ->where('s.student_id', $id)
        ->select('s.first_name', 's.last_name', 's.middle_name', 's.email', 's.year_level', 'p.program_name')
        ->first();

    if (!$student) return response()->json(['message' => 'Student not found'], 404);

    return response()->json($student);
});
 
Route::get('reports', [ReportsController::class, 'index']);

Route::apiResource('staff', StaffController::class)->only([
    'index', 'store', 'update', 'destroy',
]);
 
Route::post('staff/{staff}/login',  [StaffController::class, 'setActive']);
Route::post('staff/{staff}/logout', [StaffController::class, 'setInactive']);