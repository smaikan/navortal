---
name: adhd-recurrence-notifications
description: ADHD planlayıcısında tekrar şablonları/örnekleri, Quartz kalıcı işleri, outbox, hatırlatmalar, Web Push ve SignalR değişiklik bildirimlerini geliştir. Tekrarlama, yeniden deneme ve eski plan revizyonlarının bildirimlere etkisi için kullan.
---

# ADHD tekrarlar ve bildirimler

İlgili MVP ve mevcut recurrence/job/outbox sözleşmesini incele. Tekrar veya delivery değişirken [teslim ve tekrar referansını](references/delivery-and-recurrence.md) oku.

- Tekrar şablonunu tarihli gerçek görev örneğinden ayır; geçmiş örnekleri şablon değişikliğiyle değiştirme.
- Aynı pencerenin veya iki worker'ın işlenmesi duplicate instance oluşturmasın.
- Outbox domain değişikliğiyle aynı transaction'da yazılır. İşlem commit olmadan dış bildirim gönderme.
- Quartz kalıcı job store kullanır; sayaç doğruluğu scheduler'ın zamanında tick vermesine bağlı değildir.
- Retry/restart için kararlı iş ve bildirim kimlikleri; iş sahiplenme ve bounded retry kullan.
- Gönderimden önce hatırlatmanın hâlâ geçerli revision/schedule'a ait olduğunu doğrula.
- Erteleme, kullanıcı tür tercihleri ve sessiz saatleri uygula; tekrar görünürlükte hem local hem push ile aynı bildirimi çoğaltma.
- Push tesliminde exactly-once garantisi verme; geçersiz abonelikleri temizle.
- SignalR güncelleme işaretidir; reconnect sonrası HTTP ile güncel durum alınabilir olmalıdır. Aynı süresiz uygulama JWT'si accessTokenFactory ile taşınır; refresh veya cookie oturumu ekleme. Hub'a özel standart access_token query taşımasını redakte et; grupları doğrulanmış sub kullanıcısına göre belirle.

## Doğrulama

Aynı tekrar penceresi iki kez; worker restart; outbox commit sonrası crash; eski planın reminder'ı; iptal/snooze/DND; geçersiz subscription; Pomodoro hedefinin tek mantıksal bildirimi; başka kullanıcının SignalR grubuna erişim senaryolarını kapsa. Gerçek provider yoksa test double kapsamını açık belirt.
