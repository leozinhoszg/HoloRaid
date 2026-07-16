---

# Motion Design

O HoloRaid deve transmitir a sensação de uma interface futurista, inspirada em consoles holográficos e painéis de comando.

As animações devem ser rápidas, suaves e discretas.

Objetivos:

- Melhorar percepção de velocidade.
- Guiar a atenção do usuário.
- Dar feedback visual.
- Tornar a interface moderna.
- Nunca prejudicar a produtividade.

Tempo padrão das animações

- 150ms
- 200ms
- 250ms

Curvas

- easeOut
- easeInOut
- fastOutSlowIn

Evitar animações acima de 400ms.

---

# Flutter Motion

Bibliotecas

- flutter_animate
- animations
- flutter_staggered_animations

Animações utilizadas

- Fade In
- Fade Out
- Scale
- Slide
- Hero Animation
- Shared Axis Transition
- Container Transform
- Page Transition
- AnimatedSwitcher
- AnimatedContainer
- AnimatedOpacity
- AnimatedPositioned
- AnimatedAlign

---

# Loading

Utilizar Skeleton Loading.

Nunca utilizar apenas CircularProgressIndicator.

Exemplo

- Skeleton Card
- Skeleton Avatar
- Skeleton Table
- Skeleton List

---

# Microinterações

Botões

- Ripple
- Scale 0.97 ao pressionar

Cards

- Elevação suave
- Glow discreto

Badges

- Fade

Snackbars

- Slide Bottom

Dialogs

- Scale + Fade

Drawer

- Slide

---

# Motion Guidelines

Toda ação do usuário deve possuir feedback visual.

Exemplos

Entrar na Raid

↓

Botão muda de estado

↓

Loading

↓

Confirmação

↓

Atualização da lista

↓

Snackbar

---

# WebGL

A versão Web poderá utilizar efeitos gráficos acelerados por GPU.

Bibliotecas recomendadas

- Three.js
- React Three Fiber (caso exista um portal React no futuro)
- shader_gradient
- flutter_shaders
- Fragment Shaders (Flutter)

Objetivo

Criar uma identidade visual inspirada em hologramas e interfaces sci-fi.

Nunca utilizar WebGL em excesso.

Os efeitos devem ser opcionais e desativáveis.

---

# Three.js

Utilizar somente na versão Web para componentes específicos.

Exemplos

Tela Login

- Fundo espacial animado
- Nebulosas
- Estrelas
- Partículas

Dashboard

- Fundo holográfico
- Grid futurista
- Linhas animadas

Perfil

- Modelo 3D do Holocron
- Rotação suave

Raid

- Mapa estelar
- Conexões animadas
- Partículas

---

# Flutter Shaders

Utilizar Fragment Shaders para

- Gradientes animados
- Glow
- Scanner
- Scanline
- Energy Pulse
- Animated Border
- Hologram Effect

---

# Partículas

Utilizar partículas leves.

Exemplos

- Poeira espacial
- Estrelas
- Faíscas
- Energia

Quantidade máxima

100 partículas simultâneas.

---

# Glassmorphism

Aplicar apenas em

- Dialogs
- Sidebar
- Cards especiais

Nunca utilizar em tabelas.

---

# Holographic Effects

Componentes premium

- Cards
- Hero Banner
- Dashboard
- Login

Utilizar

- Blur
- Glow
- Gradient Overlay
- Animated Border

---

# Efeitos Sonoros (Opcional)

Preparar arquitetura para adicionar futuramente

- Clique
- Confirmação
- Erro
- Notificação
- Raid iniciando

Todos configuráveis.

---

# Performance

Meta

60 FPS

Objetivos

Android

≥60 FPS

Windows

≥120 FPS quando possível

Web

≥60 FPS

---

# Acessibilidade

Adicionar opção

"Reduzir animações"

Quando ativada

- Desabilitar partículas
- Desabilitar efeitos WebGL
- Reduzir duração das animações
- Remover animações contínuas

---

# Responsividade

Android

Animações simplificadas.

Windows

Animações completas.

Web

Animações completas + WebGL + Three.js.

Todos os efeitos devem possuir fallback para dispositivos sem aceleração gráfica.

---

# Filosofia

O HoloRaid deve transmitir a sensação de estar utilizando o console de comando de uma nave da República ou do Império.

A interface deve parecer viva, mas nunca exagerada. Os efeitos visuais devem destacar informações importantes e enriquecer a experiência, sem distrair o usuário ou comprometer a usabilidade durante uma Operation.
