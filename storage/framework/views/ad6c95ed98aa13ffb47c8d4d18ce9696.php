<!DOCTYPE html>
<html lang="<?php echo e(str_replace('_', '-', app()->getLocale())); ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="<?php echo e(csrf_token()); ?>">
    <?php if(auth()->guard()->check()): ?>
    <meta name="user-name" content="<?php echo e(auth()->user()->name); ?>">
    <?php endif; ?>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2060193879936074" crossorigin="anonymous"></script>
    <title>Sistem Pembayaran</title>

    <?php echo app('Illuminate\Foundation\Vite')->reactRefresh(); ?>
    <?php echo app('Illuminate\Foundation\Vite')(['resources/css/app.css', 'resources/js/main.jsx']); ?>
</head>
<body>
    <div id="app"></div>
    <?php if(auth()->guard()->check()): ?>
    <script>
        window.appUser = <?php echo json_encode(auth()->user()->name, 15, 512) ?>;
        window.isAuthenticated = true;
    </script>
    <?php else: ?>
    <script>
        window.isAuthenticated = false;
    </script>
    <?php endif; ?>
</body>
</html>
<?php /**PATH D:\Projek\pembayaran\resources\views/app.blade.php ENDPATH**/ ?>