# Stream Now — Google Play Android release

Aparelho alvo deste módulo: **Android celular/tablet**. Android TV / Google TV exigem launcher Leanback, banner TV, interface com D-pad, testes em TV e critérios próprios. Este AAB não deve ser apresentado como versão Android TV certificada.

## Código real
O aplicativo Android atual abre o **Stream Now existente**, hospedado no Cloudflare, que contém catálogo de canais, login e aprovação administrativa; não é o aplicativo demonstrativo do outro repositório. ID: `com.streamnow.app`. Versão candidata: `1.0.0`, code `6`. O Google pode rejeitar wrappers WebView com pouca funcionalidade; validar qualidade e conteúdo antes da submissão.

## Compilação Play
O workflow `.github/workflows/streamnow-android-production.yml` gera Android App Bundle (AAB) em vez de APK debug. Target e compile SDK: API 36, conforme regra vigente para novos apps Android convencionais (novembro de 2026).

Sem a chave de upload do titular, a CI compila AAB **NÃO ASSINADO** claramente rotulado; este arquivo não pode ser submetido como release Play. Não inventar ou gerar chave descartável para app distribuído.

Para AAB de upload assinado, o titular prepara sua identidade de assinatura persistente e configura quatro GitHub Secrets sem enviá-los ao chat:
- `STREAMNOW_UPLOAD_KEYSTORE_BASE64` — arquivo JKS em base64
- `STREAMNOW_UPLOAD_KEYSTORE_PASSWORD`
- `STREAMNOW_UPLOAD_KEY_ALIAS`
- `STREAMNOW_UPLOAD_KEY_PASSWORD`

Depois de configurar Play App Signing, preservar cópia privada da chave de upload para atualizações. Não colocar senhas/keystore no código ou nos relatórios. O workflow faz validação da assinatura no AAB antes de disponibilizar o arquivo.

## Bloqueios externos reais
1. Acesso a uma conta **Google Play Console** de desenvolvedor, verificada.
2. Criar `com.streamnow.app` no console (se disponível), informar nome legal do desenvolvedor e contatos.
3. Política de privacidade pública, data safety, política de contas e exclusão de conta quando aplicável; país, classificação indicativa, anúncios, preços e acesso da equipe de revisão.
4. Comprovar licenças de exibição/distribuição dos canais. Playlists abertas não são autorizações de revenda/retransmissão.
5. Testes físicos de cadastro, aprovação, login, playback real, busca e controles; qualidade e conformidade WebView.
6. Enviar AAB assinado ao Play Console e cumprir teste obrigatório quando exigido pela modalidade/idade da conta. Publicar após aprovação Google.

**Status:** pipeline de compilação AAB configurado, publicação na Google Play não comprovada. Não confundir build, assinatura, upload, revisão e disponibilidade pública.

Documentação:
https://developer.android.com/google/play/requirements/target-sdk
https://support.google.com/googleplay/android-developer/answer/9842756
https://support.google.com/googleplay/android-developer/answer/9859348
