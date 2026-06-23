<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Staff extends Model
{
    protected $table      = 'tbl_staff';
    protected $primaryKey = 'staff_id';
    public    $timestamps = false;

    protected $fillable = [
        'username',   // stores full name
        'email',
        'user_role',
        'password',
        'status',     // 'Active' when logged in, 'Inactive' on logout
    ];

    protected $hidden = ['password'];

    public function getStaffCodeAttribute(): string
    {
        return 'STF-' . str_pad((string) $this->staff_id, 3, '0', STR_PAD_LEFT);
    }

    public function resolveRouteBinding($value, $field = null)
    {
        if (preg_match('/^STF-?0*(\d+)$/i', (string) $value, $m)) {
            $value = (int) $m[1];
        }
        return $this->where($this->getRouteKeyName(), $value)->firstOrFail();
    }

    public function activities()
    {
        return $this->hasMany(SystemActivity::class, 'staff_id', 'staff_id');
    }
}