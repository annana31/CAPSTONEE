<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateStaffRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $staffId = $this->route('staff')->staff_id;

        return [
            'fullName' => ['required', 'string', 'max:50', Rule::unique('tbl_staff', 'username')->ignore($staffId, 'staff_id')],
            'email'    => ['required', 'email', 'max:100', Rule::unique('tbl_staff', 'email')->ignore($staffId, 'staff_id')],
            'password' => ['nullable', 'string', 'max:24'],
            // status is NOT editable manually — system controls it
        ];
    }
}