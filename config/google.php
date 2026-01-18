<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Google Sheets Integration
    |--------------------------------------------------------------------------
    |
    | Configuration for Google Sheets API integration. This is used for
    | customer verification workflow with Google Forms data.
    |
    */

    'enabled' => env('GOOGLE_SHEETS_ENABLED', false),
    
    'spreadsheet_id' => env('GOOGLE_SHEETS_ID'),
    
    'range' => env('GOOGLE_SHEETS_RANGE', 'Sheet1!A:R'),
    
    'skip_rows' => (int) env('GOOGLE_SHEETS_SKIP_ROWS', 0),
    
    'credentials_path' => env('GOOGLE_SHEETS_CREDENTIALS_PATH', storage_path('app/google-sheets-credentials.json')),

    /*
    |--------------------------------------------------------------------------
    | Google Forms Configuration
    |--------------------------------------------------------------------------
    |
    | URL to the Google Form for customer registration/verification.
    |
    */

    'form_url' => env('GOOGLE_FORM_URL', 'https://forms.gle/D7e6D1W5nJHsRiBC7'),

];
