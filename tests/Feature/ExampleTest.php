<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_startseite_erreichbar(): void
    {
        $response = $this->get('/de');

        $response->assertStatus(200);
    }

    public function test_turnierliste_erreichbar(): void
    {
        $response = $this->get('/de');

        $response->assertStatus(200);
    }

    public function test_api_ohne_token_gibt_401(): void
    {
        $response = $this->getJson('/api/v1/tournaments/nicht-vorhanden/registrations');

        $response->assertStatus(401);
    }
}
