<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserApproved
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->canAccessAdmin()) {
            return $next($request);
        }

        return redirect()->route('approval.pending');
    }
}
