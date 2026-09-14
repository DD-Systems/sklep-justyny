# Sklep dla znajomych

Kopia projektu D:\projekty\Sklep App z nowym wyglądem. Źródło: https://dd-systems.github.io/sklep-app/

Uruchom START.cmd (wymaga Node.js), następnie otwórz http://localhost:8090. Panel produktów: http://localhost:8090/admin.html.

Zachowano 16 produktów, zdjęcia, ceny, koszyk, ograniczenia ilości, eksport katalogu i zamówienie przez aplikację pocztową. Adres odbiorcy pozostaje taki jak w oryginale: sklepapp2026@gmail.com.

Zamówienia z tej kopii są oznaczone w temacie i treści jako „Justyna 10%”. Wiadomość pokazuje produkty i rozliczenie w układzie tabelarycznym: wartość sprzedaży, prowizję 10% i kwotę po jej odjęciu. Powiadomienia dla Justyny są wysyłane na `justynap2512@wp.pl`; adres można zmienić w `shop-config.js` w polu `partnerEmail`.

Panel umożliwia pobranie products.json — podmień nim plik katalogu. Nie podłączono API magazynu. Tak jak w źródłowej implementacji przycisk zamówienia przygotowuje e-mail.

Nowy wygląd: theme.css oraz sekcja powitalna w index.html. Oryginał i publiczna strona nie zostały zmienione. Kopia nie jest opublikowana.
