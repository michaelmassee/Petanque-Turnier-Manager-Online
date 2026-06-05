<x-public-layout :title="__('legal.imprint.title')">

<div class="mx-auto max-w-3xl space-y-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-950">{{ __('legal.imprint.title') }}</h1>
        <p class="mt-2 text-sm text-gray-600">{{ __('legal.imprint.intro') }}</p>
    </div>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.provider') }}</h2>
        <div class="mt-3 space-y-1 text-gray-700">
            <p>{{ config('legal.provider_name') }}</p>
            @if(config('legal.provider_street'))<p>{{ config('legal.provider_street') }}</p>@endif
            @if(config('legal.provider_postal_code') || config('legal.provider_city'))
                <p>{{ trim(config('legal.provider_postal_code') . ' ' . config('legal.provider_city')) }}</p>
            @endif
            @if(config('legal.provider_country'))<p>{{ config('legal.provider_country') }}</p>@endif
        </div>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.contact') }}</h2>
        <div class="mt-3 space-y-1 text-gray-700">
            @if(config('legal.provider_email'))<p>{{ __('legal.email') }}: <a class="text-green-700 hover:underline" href="mailto:{{ config('legal.provider_email') }}">{{ config('legal.provider_email') }}</a></p>@endif
            @if(config('legal.provider_phone'))<p>{{ __('legal.phone') }}: {{ config('legal.provider_phone') }}</p>@endif
        </div>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.responsible_content') }}</h2>
        <div class="mt-3 space-y-1 text-gray-700">
            <p>{{ config('legal.responsible_person') ?: config('legal.provider_name') }}</p>
            @if(config('legal.responsible_street'))<p>{{ config('legal.responsible_street') }}</p>@endif
            @if(config('legal.responsible_postal_code') || config('legal.responsible_city'))
                <p>{{ trim(config('legal.responsible_postal_code') . ' ' . config('legal.responsible_city')) }}</p>
            @endif
            @if(config('legal.responsible_country'))<p>{{ config('legal.responsible_country') }}</p>@endif
        </div>
    </section>
</div>

</x-public-layout>
