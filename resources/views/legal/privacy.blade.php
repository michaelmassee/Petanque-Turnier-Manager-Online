<x-public-layout :title="__('legal.privacy.title')">

<div class="mx-auto max-w-3xl space-y-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-950">{{ __('legal.privacy.title') }}</h1>
        <p class="mt-2 text-sm text-gray-600">{{ __('legal.privacy.intro') }}</p>
    </div>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.controller') }}</h2>
        <div class="mt-3 space-y-1 text-gray-700">
            <p>{{ config('legal.provider_name') }}</p>
            @if(config('legal.provider_email'))<p>{{ __('legal.email') }}: <a class="text-green-700 hover:underline" href="mailto:{{ config('legal.provider_email') }}">{{ config('legal.provider_email') }}</a></p>@endif
            @if(config('legal.privacy_email'))<p>{{ __('legal.privacy.privacy_contact') }}: <a class="text-green-700 hover:underline" href="mailto:{{ config('legal.privacy_email') }}">{{ config('legal.privacy_email') }}</a></p>@endif
        </div>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.privacy.processed_data_title') }}</h2>
        <ul class="mt-3 list-disc space-y-2 ps-5 text-gray-700">
            <li>{{ __('legal.privacy.data_account') }}</li>
            <li>{{ __('legal.privacy.data_registration') }}</li>
            <li>{{ __('legal.privacy.data_tournament') }}</li>
            <li>{{ __('legal.privacy.data_technical') }}</li>
        </ul>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.privacy.purposes_title') }}</h2>
        <p class="mt-3 text-gray-700">{{ __('legal.privacy.purposes_text') }}</p>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.privacy.legal_basis_title') }}</h2>
        <p class="mt-3 text-gray-700">{{ __('legal.privacy.legal_basis_text') }}</p>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.privacy.recipients_title') }}</h2>
        <p class="mt-3 text-gray-700">{{ __('legal.privacy.recipients_text') }}</p>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.privacy.retention_title') }}</h2>
        <p class="mt-3 text-gray-700">{{ __('legal.privacy.retention_text', ['months' => config('legal.retention_registration_months')]) }}</p>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.privacy.cookies_title') }}</h2>
        <p class="mt-3 text-gray-700">{{ __('legal.privacy.cookies_text') }}</p>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">{{ __('legal.privacy.rights_title') }}</h2>
        <p class="mt-3 text-gray-700">{{ __('legal.privacy.rights_text', ['authority' => config('legal.supervisory_authority')]) }}</p>
    </section>
</div>

</x-public-layout>
