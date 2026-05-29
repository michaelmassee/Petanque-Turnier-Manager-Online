<x-mail::message>
# {{ __('emails.confirmed.greeting', ['name' => $registration->vollstaendigerName()]) }}

{{ __('emails.confirmed.body', [
    'tournament' => $registration->tournament->name,
    'date' => $registration->tournament->date->format('d.m.Y'),
    'location' => $registration->tournament->location,
]) }}

<x-mail::button :url="url('/de/registration/' . $registration->token . '/cancel')" color="error">
{{ __('emails.confirmed.cancel_button') }}
</x-mail::button>

{{ __('emails.confirmed.footer') }}

{{ config('app.name') }}
</x-mail::message>
