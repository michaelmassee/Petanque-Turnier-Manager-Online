<?php

if (! function_exists('lroute')) {
    function lroute(string $name, mixed $parameters = [], bool $absolute = true): string
    {
        $locale = app()->getLocale();

        return route("public.{$locale}.{$name}", $parameters, $absolute);
    }
}

if (! function_exists('public_locale_route')) {
    function public_locale_route(string $locale, string $name = 'tournaments.index', mixed $parameters = [], bool $absolute = true): string
    {
        return route("public.{$locale}.{$name}", $parameters, $absolute);
    }
}

if (! function_exists('mroute')) {
    function mroute(string $name, mixed $parameters = [], bool $absolute = true): string
    {
        $locale = app()->getLocale();

        return route("public.{$locale}.app.{$name}", $parameters, $absolute);
    }
}
