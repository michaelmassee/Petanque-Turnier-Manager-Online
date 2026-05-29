<?php

namespace App\Http\Controllers\Admin;

use App\Enums\RegistrationStatus;
use App\Http\Controllers\Controller;
use App\Models\Registration;
use App\Models\Tournament;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;

class RegistrationController extends Controller
{
    public function index(string $tournament): View
    {
        $t = Tournament::findOrFail($tournament);
        $registrations = $t->registrations()
            ->orderBy('status')
            ->orderBy('registered_at')
            ->get();

        return view('admin.registrations.index', ['tournament' => $t, 'registrations' => $registrations]);
    }

    public function updateStatus(Request $request, string $registration): RedirectResponse
    {
        $r = Registration::findOrFail($registration);
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:' . implode(',', array_column(RegistrationStatus::cases(), 'value'))],
        ]);

        $r->update($validated);

        return back()->with('success', __('admin.save') . ' ✓');
    }

    public function updateSeeding(Request $request, string $registration): RedirectResponse
    {
        $r = Registration::findOrFail($registration);
        $validated = $request->validate([
            'seeding_position' => ['nullable', 'integer', 'min:1'],
            'ptm_player_nr' => ['nullable', 'integer', 'min:1'],
        ]);

        $r->update($validated);

        return back()->with('success', __('admin.save') . ' ✓');
    }

    public function exportCsv(string $tournament): Response
    {
        $t = Tournament::findOrFail($tournament);
        $registrations = $t->registrations()
            ->where('status', RegistrationStatus::Confirmed)
            ->orderBy('seeding_position')
            ->orderBy('registered_at')
            ->get();

        $csvInhalt = $this->erstelleCsv($t, $registrations);
        $dateiname = 'meldeliste_' . str_replace(' ', '_', $t->name) . '_' . $t->date->format('Y-m-d') . '.csv';

        return response($csvInhalt, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $dateiname . '"',
        ]);
    }

    private function erstelleCsv(Tournament $tournament, $registrations): string
    {
        $spielerAnzahl = $tournament->formation->spielerAnzahl();
        $zeilen = [];

        $kopfzeile = ['Nr', 'Vorname', 'Nachname', 'Verein', 'Lizenz', 'Setzpos'];
        if ($spielerAnzahl >= 2) {
            $kopfzeile = array_merge($kopfzeile, ['Vorname2', 'Nachname2']);
        }
        if ($spielerAnzahl >= 3) {
            $kopfzeile = array_merge($kopfzeile, ['Vorname3', 'Nachname3']);
        }
        if ($spielerAnzahl > 1) {
            $kopfzeile[] = 'Teamname';
        }

        $zeilen[] = implode(';', $kopfzeile);

        $nr = 1;
        foreach ($registrations as $reg) {
            $zeile = [
                $reg->ptm_player_nr ?? $nr,
                $reg->first_name,
                $reg->last_name,
                $reg->club ?? '',
                $reg->license_nr ?? '',
                $reg->seeding_position ?? '',
            ];

            if ($spielerAnzahl >= 2) {
                $zeile[] = $reg->partner_first_name ?? '';
                $zeile[] = $reg->partner_last_name ?? '';
            }
            if ($spielerAnzahl >= 3) {
                $zeile[] = $reg->partner2_first_name ?? '';
                $zeile[] = $reg->partner2_last_name ?? '';
            }
            if ($spielerAnzahl > 1) {
                $zeile[] = $reg->team_name ?? '';
            }

            $zeilen[] = implode(';', array_map(fn($w) => '"' . str_replace('"', '""', (string)$w) . '"', $zeile));
            $nr++;
        }

        return "\xEF\xBB\xBF" . implode("\r\n", $zeilen);
    }
}
