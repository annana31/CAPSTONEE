<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class StaffResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'        => $this->staff_code,
            'fullName'  => $this->username,
            'email'     => $this->email,
            'role'      => $this->user_role,
            'status'    => $this->status,
            'lastLogin' => $this->last_login
                            ? \Carbon\Carbon::parse($this->last_login)->timezone('Asia/Manila')->format('Y-m-d H:i')
                            : null,
        ];
    }
}