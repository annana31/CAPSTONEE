<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStaffRequest;
use App\Http\Requests\UpdateStaffRequest;
use App\Http\Resources\StaffResource;
use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class StaffController extends Controller
{
    /**
     * GET /api/staff
     * Only returns Registrar Staff — Admin is excluded from this list.
     */
    public function index(Request $request)
    {
        $search = $request->query('search');

        $query = Staff::query()
            ->select('tbl_staff.*')
            // Exclude Admin — admin manages staff but doesn't appear in the staff list
            ->where('user_role', '!=', 'Admin')
            ->selectSub(function ($q) {
                $q->from('tbl_system_activity')
                  ->selectRaw('MAX(date_time)')
                  ->whereColumn('tbl_system_activity.staff_id', 'tbl_staff.staff_id')
                  ->where('activity_type', 'login');
            }, 'last_login')
            ->orderBy('staff_id');

        if (filled($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('username', 'ilike', "%{$search}%")
                  ->orWhere('email', 'ilike', "%{$search}%");
                if (preg_match('/^STF-?0*(\d+)$/i', trim($search), $m)) {
                    $q->orWhere('staff_id', (int) $m[1]);
                }
            });
        }

        $staff = $query->get();

        // Count only non-admin staff
        $baseQuery = Staff::where('user_role', '!=', 'Admin');

        return StaffResource::collection($staff)->additional([
            'meta' => [
                'total'    => (clone $baseQuery)->count(),
                'active'   => (clone $baseQuery)->where('status', 'Active')->count(),
                'inactive' => (clone $baseQuery)->where('status', 'Inactive')->count(),
            ],
        ]);
    }

    /**
     * POST /api/staff
     * New staff always starts as Inactive — becomes Active on first login.
     */
    public function store(StoreStaffRequest $request)
    {
        $staff = Staff::create([
            'username'  => $request->validated('fullName'),
            'email'     => $request->validated('email'),
            'password'  => $request->validated('password'),
            'user_role' => 'Registrar Staff',
            'status'    => 'Inactive', // system will set to Active on login
        ]);

        $staff = Staff::find($staff->staff_id);

        return (new StaffResource($staff))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * PUT /api/staff/{staff}
     * Admin can edit name, email, password — but NOT status (system controls that).
     */
    public function update(UpdateStaffRequest $request, Staff $staff)
    {
        $data = [
            'username' => $request->validated('fullName'),
            'email'    => $request->validated('email'),
        ];

        if (filled($request->validated('password'))) {
            $data['password'] = $request->validated('password');
        }

        $staff->update($data);

        return new StaffResource($staff);
    }

    /**
     * DELETE /api/staff/{staff}
     */
    public function destroy(Staff $staff)
    {
        $staff->delete();
        return response()->noContent();
    }

    /**
     * POST /api/staff/{staff}/login
     * Call this when a staff member successfully logs in — sets status to Active.
     */
    public function setActive(Staff $staff)
    {
        $staff->update(['status' => 'Active']);
        return response()->json(['message' => 'Staff set to Active.']);
    }

    /**
     * POST /api/staff/{staff}/logout
     * Call this when a staff member logs out — sets status to Inactive.
     */
    public function setInactive(Staff $staff)
    {
        $staff->update(['status' => 'Inactive']);
        return response()->json(['message' => 'Staff set to Inactive.']);
    }
}