<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RequestController extends Controller
{
    // GET /api/request/student/{student_id}
    public function getByStudent($student_id)
    {
        $requests = DB::select("
            SELECT 
                r.request_id,
                r.student_id,
                r.date_request,
                d.document_name,
                rd.status
            FROM tbl_request r
            JOIN tbl_request_document rd ON r.request_id = rd.request_id
            JOIN tbl_documents d ON rd.document_id = d.document_id
            WHERE r.student_id = ?
        ", [$student_id]);

        return response()->json($requests);
    }

    // POST /api/request
    public function store(Request $request)
{
    $validated = $request->validate([
        'student_id'  => 'required|integer',
        'document_id' => 'required|integer',
        'documents'   => 'required|array',
        'documents.*' => 'integer',
        'purpose'     => 'nullable|string',   // ← add
    ]);

    $requestId = DB::table('tbl_request')->insertGetId([
        'student_id'   => $validated['student_id'],
        'document_id'  => $validated['document_id'],
        'purpose'      => $validated['purpose'] ?? null,   // ← add
        'date_request' => now(),
    ], 'request_id');

    foreach ($validated['documents'] as $docId) {
        DB::table('tbl_request_document')->insert([
            'request_id'  => $requestId,
            'document_id' => $docId,
            'status'      => 'Pending',
        ]);
    }

    return response()->json([
        'message'    => 'Request submitted successfully',
        'request_id' => $requestId,
    ], 201);
    }
}