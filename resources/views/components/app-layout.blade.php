@props(['hideNavbar' => false, 'header' => null])

<x-layouts.app :hideNavbar="$hideNavbar">
    @isset($header)
        <x-slot name="header">{{ $header }}</x-slot>
    @endisset
    {{ $slot }}
</x-layouts.app>
