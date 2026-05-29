<?php

if (! function_exists('lroute')) {
    function lroute(string $name, mixed $parameters = [], bool $absolute = true): string
    {
        $locale = app()->getLocale();
        return route("public.{$locale}.{$name}", $parameters, $absolute);
    }
}
