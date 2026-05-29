<?php

namespace App\Mail;

use App\Models\Registration;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class RegistrationReceived extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly Registration $registration) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: __('emails.received.subject', ['tournament' => $this->registration->tournament->name]),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.registration-received',
        );
    }
}
