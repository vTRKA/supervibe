import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGraph } from '../scripts/lib/code-graph.mjs';

const FIXTURES = [
  {
    name: 'React TSX: memo, forwardRef, nested HOC, hook calls, JSX refs',
    path: 'src/pages/IdeasPage.tsx',
    code: `
import { forwardRef, memo } from 'react';

const OrgControls = memo(() => {
  trackControls();
  return <Toolbar />;
});

export const SearchInput = forwardRef<HTMLInputElement>((props, ref) => {
  focusInput();
  return <BaseInput ref={ref} />;
});

export const IdeasPage = memo(forwardRef(function IdeasPage(props, ref) {
  useUserVPNConfigQuery();
  return <OrgControls />;
}));
`,
    symbols: ['OrgControls', 'SearchInput', 'IdeasPage'],
    edges: [
      { from: 'OrgControls', kind: 'calls', to: 'trackControls' },
      { from: 'OrgControls', kind: 'references', to: 'Toolbar' },
      { from: 'SearchInput', kind: 'calls', to: 'focusInput' },
      { from: 'SearchInput', kind: 'references', to: 'BaseInput' },
      { from: 'IdeasPage', kind: 'calls', to: 'useUserVPNConfigQuery' },
      { from: 'IdeasPage', kind: 'references', to: 'OrgControls' },
    ],
    absentEdges: [{ kind: 'references', to: 'button' }],
  },
  {
    name: 'Angular TS: class methods and class-field arrow methods',
    path: 'src/app/ideas.component.ts',
    code: `
import { Component } from '@angular/core';

@Component({ selector: 'app-ideas', template: '<button (click)="loadUser()">Load</button>' })
export class IdeasComponent {
  loadUser = () => {
    return fetchUser();
  };

  ngOnInit() {
    this.loadUser();
  }
}
`,
    symbols: ['IdeasComponent', 'loadUser', 'ngOnInit'],
    edges: [
      { from: 'loadUser', kind: 'calls', to: 'fetchUser' },
      { from: 'ngOnInit', kind: 'calls', to: 'loadUser' },
    ],
  },
  {
    name: 'NestJS TS: decorated controller method and service calls',
    path: 'src/users/users.controller.ts',
    code: `
import { Controller, Post } from '@nestjs/common';

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post()
  createUser(dto: CreateUserDto) {
    return this.service.create(dto);
  }
}
`,
    symbols: ['UsersController', 'createUser'],
    edges: [{ from: 'createUser', kind: 'calls', to: 'create' }],
  },
  {
    name: 'JavaScript JSX: arrow components and class field handlers',
    path: 'src/Card.jsx',
    code: `
const Button = () => <button />;
const Card = () => <Button />;

class CardStore {
  loadCard = () => fetchCard();
}
`,
    symbols: ['Button', 'Card', 'CardStore', 'loadCard'],
    edges: [
      { from: 'Card', kind: 'references', to: 'Button' },
      { from: 'loadCard', kind: 'calls', to: 'fetchCard' },
    ],
    absentEdges: [{ kind: 'references', to: 'button' }],
  },
  {
    name: 'Vue SFC: script setup arrow function and template reference',
    path: 'src/components/Foo.vue',
    code: `<template>
  <button @click="handleClick">{{ label }}</button>
</template>

<script setup lang="ts">
const label = 'Save'
const handleClick = () => {
  submitForm()
}
</script>`,
    symbols: ['handleClick'],
    edges: [
      { from: 'handleClick', kind: 'calls', to: 'submitForm' },
      { kind: 'references', to: 'handleClick' },
    ],
  },
  {
    name: 'Svelte SFC: module helper and template reference',
    path: 'src/Button.svelte',
    code: `<script context="module" lang="ts">
export function helper() { return formatLabel() }
</script>

<script lang="ts">
const handleClick = () => helper()
</script>

<button on:click={handleClick}>{helper()}</button>`,
    symbols: ['helper', 'handleClick'],
    edges: [
      { from: 'helper', kind: 'calls', to: 'formatLabel' },
      { from: 'handleClick', kind: 'calls', to: 'helper' },
      { kind: 'references', to: 'handleClick' },
    ],
  },
  {
    name: 'Python FastAPI: decorated async route, service class, inheritance',
    path: 'app/routes/users.py',
    code: `
from fastapi import APIRouter

router = APIRouter()

@router.get("/users")
async def list_users():
    return await fetch_users()

class UserService(BaseService):
    async def load(self):
        return await fetch_users()
`,
    symbols: ['list_users', 'UserService', 'load'],
    edges: [
      { from: 'list_users', kind: 'calls', to: 'fetch_users' },
      { from: 'load', kind: 'calls', to: 'fetch_users' },
      { from: 'UserService', kind: 'extends', to: 'BaseService' },
    ],
  },
  {
    name: 'Go Gin: route registration, handler, struct method',
    path: 'internal/users/routes.go',
    code: `package users

import "github.com/gin-gonic/gin"

type UserService struct {}

func RegisterRoutes(r *gin.Engine) {
  r.GET("/users", listUsers)
}

func listUsers(c *gin.Context) {
  fetchUsers()
}

func (s *UserService) Load() {
  fetchUsers()
}
`,
    symbols: ['UserService', 'RegisterRoutes', 'listUsers', 'Load'],
    edges: [
      { from: 'RegisterRoutes', kind: 'calls', to: 'GET' },
      { from: 'listUsers', kind: 'calls', to: 'fetchUsers' },
      { from: 'Load', kind: 'calls', to: 'fetchUsers' },
    ],
  },
  {
    name: 'Java Spring: controller inheritance, interface, method call',
    path: 'src/main/java/app/UserController.java',
    code: `
import org.springframework.web.bind.annotation.GetMapping;

class UserController extends BaseController implements Handler {
  @GetMapping("/users")
  public List<User> listUsers() {
    return service.findAll();
  }
}
`,
    symbols: ['UserController', 'listUsers'],
    edges: [
      { from: 'UserController', kind: 'extends', to: 'BaseController' },
      { from: 'UserController', kind: 'implements', to: 'Handler' },
      { from: 'listUsers', kind: 'calls', to: 'findAll' },
    ],
  },
  {
    name: 'PHP Laravel: controller inheritance, interface, chained calls',
    path: 'app/Http/Controllers/UserController.php',
    code: `<?php
namespace App\\Http\\Controllers;

class UserController extends Controller implements Responsable {
  public function index() {
    return User::query()->get();
  }
}
`,
    symbols: ['UserController', 'index'],
    edges: [
      { from: 'UserController', kind: 'extends', to: 'Controller' },
      { from: 'UserController', kind: 'implements', to: 'Responsable' },
      { from: 'index', kind: 'calls', to: 'query' },
      { from: 'index', kind: 'calls', to: 'get' },
    ],
  },
  {
    name: 'Ruby Rails: controller inheritance and calls',
    path: 'app/controllers/users_controller.rb',
    code: `
class UsersController < ApplicationController
  def index
    render json: User.all
  end
end
`,
    symbols: ['UsersController', 'index'],
    edges: [
      { from: 'UsersController', kind: 'extends', to: 'ApplicationController' },
      { from: 'index', kind: 'calls', to: 'render' },
      { from: 'index', kind: 'calls', to: 'all' },
    ],
  },
  {
    name: 'Rust Axum-style service: impl method, trait signature, calls',
    path: 'src/users.rs',
    code: `
use axum::Router;

pub struct UserService;

impl UserService {
  pub fn load(&self) {
    fetch_user();
  }
}

pub trait Loader {
  fn load(&self);
}
`,
    symbols: ['UserService', 'load', 'Loader'],
    edges: [{ from: 'load', kind: 'calls', to: 'fetch_user' }],
  },
];

for (const fixture of FIXTURES) {
  test(`code graph fixture: ${fixture.name}`, async () => {
    const graph = await extractGraph(fixture.code, fixture.path);
    const names = graph.symbols.map(s => s.name);
    const edgeText = graph.edges.map(e => `${symbolNameFor(graph, e.fromId)}:${e.kind}:${e.toName}`).join(', ');

    for (const expected of fixture.symbols || []) {
      assert.ok(names.includes(expected), `expected symbol ${expected}; got ${names.join(', ')}`);
    }

    for (const expected of fixture.edges || []) {
      assert.ok(hasEdge(graph, expected), `expected edge ${JSON.stringify(expected)}; got ${edgeText}`);
    }

    for (const forbidden of fixture.absentEdges || []) {
      assert.ok(!hasEdge(graph, forbidden), `forbidden edge present ${JSON.stringify(forbidden)}; got ${edgeText}`);
    }
  });
}

function hasEdge(graph, expected) {
  return graph.edges.some((edge) => {
    if (expected.kind && edge.kind !== expected.kind) return false;
    if (expected.to && edge.toName !== expected.to) return false;
    if (expected.from && symbolNameFor(graph, edge.fromId) !== expected.from) return false;
    return true;
  });
}

function symbolNameFor(graph, fromId) {
  return graph.symbols.find((symbol) => symbol.id === fromId)?.name || '<module>';
}
