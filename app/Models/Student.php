<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Student extends Model
{
    protected $table = 'tbl_student';
    protected $primaryKey = 'student_id';
    public $timestamps = false;
}