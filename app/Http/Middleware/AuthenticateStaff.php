<?php

namespace App\Http\Middleware;

use App\Models\Staff;
use Carbon\Carbon;
use Closure;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Http\Request;

/**
 * RBAC — step 1: "Who is calling?"
 *
 * Reads the "Authorization: Bearer <token>" header, finds the matching staff
 * account and stores it on the request. Rejects with 401 if the token is
 * missing, unknown or expired.
 *
 * Alias (see Kernel.php): 'auth.staff'
 */
class AuthenticateStaff implements AuthenticatesRequests
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Only the SHA-256 hash of the token is stored in the database.
        $staff = Staff::where('api_token', hash('sha256', $token))->first();

        if (!$staff) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($staff->api_token_expires_at && Carbon::parse($staff->api_token_expires_at)->isPast()) {
            return response()->json(['message' => 'Session expired. Please log in again.'], 401);
        }

        $request->attributes->set('staff', $staff);
        $request->setUserResolver(fn () => $staff);

        return $next($request);
    }
}