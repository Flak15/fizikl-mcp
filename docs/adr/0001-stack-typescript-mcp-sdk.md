# 0001. Стек: TypeScript + официальный MCP SDK

Дата: 2026-10-31
Статус: принято

## Контекст

MCP-сервер можно писать на TypeScript (`@modelcontextprotocol/sdk`), Python (FastMCP) или Go. В окружении разработки установлен Node v24 и Python 3.9.2; современный FastMCP требует Python ≥3.10.

## Решение

TypeScript + `@modelcontextprotocol/sdk`. Сборка `tsc` → `node dist/index.js`; для разработки `tsx`.

## Последствия

- Node 24 уже установлен, ничего не обновляем.
- JSON-API Физикла естественно описывается типами TypeScript.
- Тестовый фреймворк и моки HTTP — из npm-экосистемы (решение в отдельном ADR).
