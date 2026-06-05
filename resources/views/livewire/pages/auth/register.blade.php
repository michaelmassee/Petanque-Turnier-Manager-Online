<?php

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;

new #[Layout('layouts.guest')] class extends Component
{
    public string $first_name = '';
    public string $last_name = '';
    public string $email = '';
    public string $club = '';
    public string $license_nr = '';
    public string $password = '';
    public string $password_confirmation = '';
    public bool $as_tournament_manager = false;

    /**
     * Handle an incoming registration request.
     */
    public function register(): void
    {
        $validated = $this->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:'.User::class],
            'club' => ['nullable', 'string', 'max:150'],
            'license_nr' => ['nullable', 'string', 'max:50', 'unique:'.User::class],
            'password' => ['required', 'string', 'confirmed', Rules\Password::defaults()],
            'as_tournament_manager' => ['boolean'],
        ]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['roles'] = [User::ROLE_TEILNEHMER];
        if ($validated['as_tournament_manager']) {
            $validated['roles'][] = User::ROLE_TURNIERVERWALTER;
        }
        $validated['approved_at'] = null;
        unset($validated['as_tournament_manager']);

        event(new Registered($user = User::create($validated)));

        Auth::login($user);

        $this->redirect(
            route($this->as_tournament_manager ? 'dashboard' : 'home', absolute: false),
            navigate: true
        );
    }
}; ?>

<div>
    <form wire:submit="register">
        <div>
            <x-input-label for="first_name" :value="__('admin.user_first_name')" />
            <x-text-input wire:model="first_name" id="first_name" class="block mt-1 w-full" type="text" name="first_name" required autofocus autocomplete="given-name" />
            <x-input-error :messages="$errors->get('first_name')" class="mt-2" />
        </div>

        <div class="mt-4">
            <x-input-label for="last_name" :value="__('admin.user_last_name')" />
            <x-text-input wire:model="last_name" id="last_name" class="block mt-1 w-full" type="text" name="last_name" required autocomplete="family-name" />
            <x-input-error :messages="$errors->get('last_name')" class="mt-2" />
        </div>

        <!-- Email Address -->
        <div class="mt-4">
            <x-input-label for="email" :value="__('Email')" />
            <x-text-input wire:model="email" id="email" class="block mt-1 w-full" type="email" name="email" required autocomplete="username" />
            <x-input-error :messages="$errors->get('email')" class="mt-2" />
        </div>

        <div class="mt-4">
            <x-input-label for="club" :value="__('admin.user_club')" />
            <x-text-input wire:model="club" id="club" class="block mt-1 w-full" type="text" name="club" autocomplete="organization" />
            <x-input-error :messages="$errors->get('club')" class="mt-2" />
        </div>

        <div class="mt-4">
            <x-input-label for="license_nr" :value="__('admin.user_license_nr')" />
            <x-text-input wire:model="license_nr" id="license_nr" class="block mt-1 w-full" type="text" name="license_nr" autocomplete="off" />
            <x-input-error :messages="$errors->get('license_nr')" class="mt-2" />
        </div>

        <!-- Password -->
        <div class="mt-4">
            <x-input-label for="password" :value="__('Password')" />

            <x-text-input wire:model="password" id="password" class="block mt-1 w-full"
                            type="password"
                            name="password"
                            required autocomplete="new-password" />

            <x-input-error :messages="$errors->get('password')" class="mt-2" />
        </div>

        <!-- Confirm Password -->
        <div class="mt-4">
            <x-input-label for="password_confirmation" :value="__('Confirm Password')" />

            <x-text-input wire:model="password_confirmation" id="password_confirmation" class="block mt-1 w-full"
                            type="password"
                            name="password_confirmation" required autocomplete="new-password" />

            <x-input-error :messages="$errors->get('password_confirmation')" class="mt-2" />
        </div>

        <div class="mt-4">
            <label for="as_tournament_manager" class="flex items-start gap-2 text-sm text-gray-700">
                <input wire:model="as_tournament_manager" id="as_tournament_manager" type="checkbox"
                       class="mt-0.5 rounded border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500">
                <span>{{ __('auth.register_as_tournament_manager') }}</span>
            </label>
            <p class="mt-1 text-xs text-gray-500">{{ __('auth.tournament_manager_approval_hint') }}</p>
            <x-input-error :messages="$errors->get('as_tournament_manager')" class="mt-2" />
        </div>

        <p class="mt-4 text-xs text-gray-500">
            {!! __('auth.privacy_notice', ['privacy_url' => lroute('legal.privacy')]) !!}
        </p>

        <div class="flex items-center justify-end mt-4">
            <a class="underline text-sm text-gray-600 hover:text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" href="{{ route('login') }}" wire:navigate>
                {{ __('Already registered?') }}
            </a>

            <x-primary-button class="ms-4">
                {{ __('Register') }}
            </x-primary-button>
        </div>
    </form>
</div>
