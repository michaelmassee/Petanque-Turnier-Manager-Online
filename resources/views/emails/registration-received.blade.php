<x-mail::message>
# {{ __('emails.received.greeting', ['name' => $registration->vollstaendigerName()]) }}

{{ __('emails.received.body', ['tournament' => $registration->tournament->name]) }}

{{ __('emails.received.confirm_hint') }}

<x-mail::button :url="url('/de/registration/' . $registration->token . '/confirm')" color="success">
{{ __('emails.received.confirm_button') }}
</x-mail::button>

{{ __('emails.received.expires') }}

{{ config('app.name') }}
</x-mail::message>
