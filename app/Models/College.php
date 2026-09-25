<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class College extends Model
{
    protected $table = 'tbl_college';
    protected $primaryKey = 'college_id';
    public $timestamps = false;

    public function programs()
    {
        return $this->hasMany(Program::class, 'college_id', 'college_id');
    }

    public function students()
    {
        return $this->hasMany(Student::class, 'college_id', 'college_id');
    }
}