<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LegalPagesTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_footer_links_to_legal_pages(): void
    {
        $this->get('/de')
            ->assertOk()
            ->assertSee('/de/impressum')
            ->assertSee('/de/datenschutz');
    }

    public function test_imprint_page_is_available(): void
    {
        $this->get('/de/impressum')
            ->assertOk()
            ->assertSee('Impressum')
            ->assertSee(config('legal.provider_name'))
            ->assertSee('Michael Massee')
            ->assertSee('An der Ziegelei 21')
            ->assertSee('35440 Linden');
    }

    public function test_privacy_page_is_available(): void
    {
        $this->get('/de/datenschutz')
            ->assertOk()
            ->assertSee('Datenschutzerklärung')
            ->assertSee('technisch notwendige Cookies');
    }

    public function test_public_pages_do_not_load_external_font_hosts(): void
    {
        $this->get('/de')
            ->assertOk()
            ->assertDontSee('fonts.bunny.net')
            ->assertDontSee('fonts.googleapis.com');
    }
}
