<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StudentDocument extends Model
{
    protected $table = 'tbl_student_documents';
    protected $primaryKey = 'student_documents_id';
    public $timestamps = false;
}