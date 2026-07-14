# SWTOR Raid Manager

## Visão Geral

Desenvolver uma aplicação multiplataforma em **Flutter** para **Android, Windows e Web** destinada ao gerenciamento de Operations do **Star Wars: The Old Republic (SWTOR)**.

A aplicação permitirá que os jogadores criem raids, encontrem grupos, acompanhem raids em andamento, recebam notificações em tempo real e integrem todas as informações ao Discord.

O sistema será desenvolvido utilizando:

- Flutter
- Node.js
- Express
- MySQL
- Socket.IO
- Discord OAuth2
- Discord Bot (discord.js)

---

# Objetivos

- Organizar todas as Operations da guild.
- Facilitar criação e gerenciamento de grupos.
- Evitar uso de planilhas.
- Centralizar informações dos personagens.
- Calcular automaticamente o Tier PvE.
- Permitir apenas jogadores elegíveis conforme o Tier definido pelo líder.
- Compartilhar raids através de links.
- Sincronizar tudo em tempo real com Discord.

---

# Arquitetura

```
Flutter

Android
Windows
Web

        │

 REST API

 Socket.IO

        │

Node.js (Express)

        │

MySQL

        │

Discord Bot

Discord OAuth2
```

---

# Tecnologias

## Frontend

- Flutter
- Material Design 3
- Riverpod
- GoRouter
- Dio
- Socket.IO Client
- Flutter Secure Storage
- Share Plus
- QR Generator
- Firebase Messaging
- Local Notifications

---

## Backend

- Node.js
- Express
- mysql2
- socket.io
- jsonwebtoken
- bcrypt
- dotenv
- multer
- helmet
- cors
- express-rate-limit
- discord.js
- node-cron

---

# Comunicação

REST API

Utilizada para

- Login
- CRUD
- Consultas
- Cadastro

Socket.IO

Utilizado para

- Atualização das raids
- Entrada e saída de jogadores
- Atualização das vagas
- Alteração de status
- Notificações
- Sincronização com Discord

Não utilizar SSE.

---

# Login

Login exclusivamente através do Discord.

Fluxo

```
Flutter

↓

Discord OAuth2

↓

Node.js

↓

JWT

↓

Flutter
```

Não haverá cadastro manual de usuários.

---

# Personagens

Cada usuário poderá cadastrar vários personagens.

Campos

- Nome
- Classe
- Especialização
- Role
- Facção
- Item Level

Roles

- Tank
- Heal
- DPS

Facções

- Republic
- Empire

---

# Sistema de Progressão PvE

Cada personagem possui uma pontuação baseada na conclusão de bosses.

A pontuação é permanente.

Sempre que um boss for marcado como concluído durante uma raid, todos os participantes confirmados recebem automaticamente os pontos.

---

# Sistema de Tier

O Tier será calculado automaticamente.

Não poderá ser alterado manualmente.

A regra é fixa.

## Regra Oficial

| Pontos    | Tier     |
| --------- | -------- |
| 0 - 25    | Sem Tier |
| 26 - 50   | Tier 1   |
| 51 - 75   | Tier 2   |
| 76 - 89   | Tier 3   |
| 90 - 99   | Tier 4   |
| 100 - 104 | Tier 5   |
| 105+      | Tier 6   |

Lógica equivalente

```excel
=SE(B4>=105;"Tier 6";
SE(B4>=100;"Tier 5";
SE(B4>=90;"Tier 4";
SE(B4>=76;"Tier 3";
SE(B4>=51;"Tier 2";
SE(B4>=26;"Tier 1";"Sem Tier"))))))
```

Backend

```javascript
function calcularTier(points) {
  if (points >= 105) return 6;
  if (points >= 100) return 5;
  if (points >= 90) return 4;
  if (points >= 76) return 3;
  if (points >= 51) return 2;
  if (points >= 26) return 1;
  return 0;
}
```

---

# Operations

Lista fixa

- Eternity Vault
- Karagga's Palace
- Explosive Conflict
- Terror From Beyond
- Scum and Villainy
- Dread Fortress
- Dread Palace
- Ravagers
- Temple of Sacrifice
- Gods from the Machine
- Nature of Progress (Dxun)
- The R-4 Anomaly
- Worldbreaker Monolith
- Hive of the Mountain Queen
- Golden Fury
- Eyeless
- Propagator Core XR-53
- Xenoanalyst II
- Hateful Entity
- Dreadful Entity
- Random
- Poll

---

# Criar Raid

Campos

## Operation

Lista fixa.

---

## Difficulty

- Story Mode (SM)
- Veteran Mode (HM)
- Master Mode (NiM)

---

## Size

- 8 Players
- 16 Players

---

## Facção

- Republic
- Empire

---

## Data

Date Picker

---

## Hora

Time Picker

---

## Observações

Texto livre.

---

## Required Discord Roles

Selecionar cargos do Discord.

Exemplo

- Raid Team
- Veteran
- Officer
- Guild Member

---

## Disable Mentions

Boolean

---

## Check Composition

Boolean

---

## Restrição de Tier

O líder poderá definir qual Tier mínimo será aceito.

Valores

```
Sem Tier

Tier 1

Tier 2

Tier 3

Tier 4

Tier 5

Tier 6
```

Exemplo

```
Tier mínimo

Tier 4
```

Entram

- Tier 4
- Tier 5
- Tier 6

Não entram

- Sem Tier
- Tier 1
- Tier 2
- Tier 3

Ao tentar entrar

```
Seu personagem possui Tier 3.

Esta raid exige Tier 4 ou superior.
```

---

# Tela da Raid

Mostrar

- Operation
- Difficulty
- Facção
- Status
- Data
- Hora
- Líder
- Número de jogadores
- Tier mínimo
- Observações

---

# Participantes

Cada participante possui

- Avatar
- Nick Discord
- Personagem
- Classe
- Especialização
- Role
- Item Level
- Tier
- Pontuação PvE

---

# Entrar na Raid

Fluxo

Selecionar

- Personagem

Validar

- Facção
- Tier
- Vagas

Caso aprovado

Adicionar participante.

Caso contrário

Exibir motivo.

---

# Lista de Espera

Quando atingir o limite

Adicionar automaticamente na Waitlist.

---

# Compartilhamento

Gerar

```
https://raid.brazilforce.com/r/{codigo}
```

Também gerar QR Code.

---

# Discord

Login via OAuth2.

Ao criar uma Raid

Publicar automaticamente.

Exemplo

```
Nova Raid

Dread Palace

Veteran

16 Players

Republic

Tier mínimo

Tier 4

20:30

Entrar
```

Quando alguém entra

Editar automaticamente.

```
9/16

↓

10/16
```

Quando iniciar

```
RUNNING
```

Quando finalizar

```
FINISHED
```

---

# Dashboard

Mostrar

- Raids hoje
- Raids da semana
- Raids do mês
- Participantes
- Operations mais jogadas
- Jogadores mais ativos

---

# Perfil

Mostrar

- Avatar
- Nick
- Personagens
- Pontuação PvE
- Tier
- Histórico

---

# Histórico

Mostrar

Bosses derrotados.

Operations concluídas.

World Bosses.

Pontuação.

---

# Notificações

Enviar

- Raid criada
- Raid iniciando
- Raid cancelada
- Vaga confirmada
- Entrada na raid
- Saída da raid

Android

Windows

Web

---

# Painel Administrativo

Permissões

Administrador

Pode

- Criar raids
- Editar raids
- Excluir raids
- Cancelar raids
- Encerrar raids
- Duplicar raids
- Visualizar estatísticas

---

# Banco de Dados

## usuarios

- id
- discord_id
- username
- nickname
- avatar
- email
- created_at

---

## personagens

- id
- usuario_id
- nome
- classe
- especializacao
- role
- faccao
- item_level
- total_points

---

## raids

- id
- codigo
- operation
- difficulty
- size
- faction
- minimum_tier
- notes
- start_at
- status
- discord_message_id
- created_by
- created_at

---

## raid_players

- id
- raid_id
- usuario_id
- personagem_id
- role
- status
- joined_at

---

## bosses

Tabela fixa contendo todos os bosses.

Campos

- id
- operation
- boss
- difficulty
- points

---

## character_bosses

- id
- personagem_id
- boss_id
- completed
- completed_at

---

# Fluxo de Pontuação

Raid Finalizada

↓

Selecionar bosses derrotados

↓

Sistema registra conclusão

↓

Atualiza pontuação do personagem

↓

Recalcula Tier

↓

Atualiza perfil

↓

Atualiza Discord

↓

Atualiza todos via Socket.IO

---

# Eventos Socket.IO

Cliente

- createRaid
- joinRaid
- leaveRaid
- updateRaid
- startRaid
- finishRaid
- cancelRaid

Servidor

- raidCreated
- raidUpdated
- raidStarted
- raidFinished
- raidCancelled
- playerJoined
- playerLeft
- waitlistUpdated
- notification

---

# Segurança

- JWT
- HTTPS
- Helmet
- Rate Limit
- Prepared Statements
- Validação de Payload
- Sanitização
- Controle de Permissões

---

# Roadmap

## Fase 1

- Login Discord
- Cadastro de personagens
- Listagem de raids
- Criar raid
- Entrar na raid
- Compartilhar raid
- Socket.IO

## Fase 2

- Integração completa com Discord
- Waitlist
- Notificações Push
- Dashboard
- Histórico

## Fase 3

- Sistema de pontuação PvE
- Cálculo automático de Tier
- Restrição por Tier
- Estatísticas dos jogadores
- Histórico completo de bosses
- Relatórios administrativos

---

# Objetivo Final

Criar uma plataforma moderna, rápida e multiplataforma para gerenciamento de Operations do SWTOR, substituindo planilhas e processos manuais, centralizando todas as informações dos jogadores, personagens, progressão PvE e organização de raids em um único sistema integrado ao Discord, com sincronização em tempo real através de Socket.IO.
