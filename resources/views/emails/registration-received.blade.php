<x-mail::message>
# {{ __('emails.received.greeting', ['name' => $registration->vollstaendigerName()]) }}

{{ __('emails.received.body', ['tournament' => $registration->tournament->name]) }}

{{ $registration->tournament->requiresManualConfirmation()
    ? __('emails.received.manual_confirmation')
    : __('emails.received.waitlist_hint') }}

{{ config('app.name') }}
</x-mail::message>
