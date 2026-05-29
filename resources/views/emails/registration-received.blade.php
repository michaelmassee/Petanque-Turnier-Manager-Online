<x-mail::message>
# {{ __('emails.received.greeting', ['name' => $registration->vollstaendigerName()]) }}

{{ __('emails.received.body', ['tournament' => $registration->tournament->name]) }}

{{ __('emails.received.confirm_hint') }}

<x-mail::button :url="route('public.registration.confirm', $registration->token)" color="success">
{{ __('emails.received.confirm_button') }}
</x-mail::button>

{{ __('emails.received.expires') }}

{{ config('app.name') }}
</x-mail::message>
