<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreStaffRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'fullName' => ['required', 'string', 'max:50', 'unique:tbl_staff,username'],
            'email'    => ['required', 'email', 'max:100', 'unique:tbl_staff,email'],
            'password' => ['required', 'string', 'max:24'],
            // status is NOT included here — system sets it automatically on login/logout
        ];
    }
}