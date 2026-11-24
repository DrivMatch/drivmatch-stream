# Stream Now — padrão visual multiplataforma v2

**Escopo exigido:** interface relaxante e moderna apenas em preto, vermelho, cinza, branco e variações dessas cores.

**Fonte imutável:** as duas imagens originais do proprietário continuam as autoridades canônicas na Página Stream Now, referenciadas pelo manifesto v1. A atualização é exclusivamente de derivados, sem modificar originais nem redesenhar a marca.

**Implementações:** Web/Samsung/desktop/celular/iPad utilizam os mesmos arquivos `site/tv.html`, `site/streamnow-graphite.css`, `site/streamnow-brand.webp`, `site/streamnow-icon.webp`. A interface clássica e biblioteca importam o mesmo tema final e os mesmos assets. O APK Android 0.2.1 usa os mesmos derivados: ícone 512×512 e palavra STREAM NOW horizontal transparente 960×275, em toolbar grafite com vermelho discreto. E-mail convite utiliza o placeholder da URL pública do logo, sem inventar remetente.

**Observação de qualidade:** os derivados de produção são **imagens WebP com transparência**, não arquivos vetoriais SVG. A fonte original 1536 px e a derivação WebP de 960 px estão preservadas com margem. Se for exigido SVG realmente vetorizado, o designer precisa fornecer o original vetorial ou aprovar uma vetorização posterior, sem alterar a marca.

**Textos proibidos sem aprovação:** “Sua TV, do seu jeito.”, “Área pessoal”, “sua senha particular”, títulos promocionais inventados e funções inexistentes. Usar rótulos técnicos: Stream Now, Entrar, TV ao vivo, Países e canais, Guia de canais, Reprodução, Favoritos, Minhas listas.

**Limites verificáveis:** automatização Chromium/Firefox/WebKit e emulação de viewport não equivalem à homologação em Samsung físico, iPad físico ou APK real. O APK permanece apontando para `streamnow.pages.dev` como solicitado; o projeto Cloudflare disponibilizado até aqui é `streamnow-2o1.pages.dev`, e **não haverá troca tácita de domínio**.

**Autenticação:** a migração da senha compartilhada para login individual Supabase é um trabalho separado; publicação só é permitida com credenciais públicas corretas, testes e convite/recuperação aprovados.