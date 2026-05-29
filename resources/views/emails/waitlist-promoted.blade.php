<x-mail::message>
# {{ __('emails.waitlist_promoted.greeting', ['name' => $registration->vollstaendigerName()]) }}

{{ __('emails.waitlist_promoted.body', ['tournament' => $registration->tournament->name]) }}

{{ config('app.name') }}
</x-mail::message>
