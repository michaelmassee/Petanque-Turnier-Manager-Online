<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    private const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'nl', 'es'];
    private const DEFAULT_LOCALE = 'de';

    public function handle(Request $request, Closure $next): Response
    {
        $locale = $request->segment(1);

        if (in_array($locale, self::SUPPORTED_LOCALES, strict: true)) {
            App::setLocale($locale);
        } else {
            $browserLocale = substr($request->getPreferredLanguage(self::SUPPORTED_LOCALES) ?? '', 0, 2);
            App::setLocale(in_array($browserLocale, self::SUPPORTED_LOCALES, strict: true) ? $browserLocale : self::DEFAULT_LOCALE);
        }

        return $next($request);
    }
}
