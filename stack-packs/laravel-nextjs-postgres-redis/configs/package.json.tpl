{
  "name": "{{project-name}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "prepare": "husky",
    "dev": "concurrently \"npm:dev:backend\" \"npm:dev:frontend\"",
    "dev:backend": "cd backend && php artisan serve",
    "dev:frontend": "cd frontend && npm run dev",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && ./vendor/bin/pest --parallel",
    "test:frontend": "cd frontend && npm test -- --run",
    "check": "npm run check:backend && npm run check:frontend",
    "check:backend": "cd backend && ./vendor/bin/pint --test && ./vendor/bin/phpstan analyse",
    "check:frontend": "cd frontend && npm run typecheck && npm run lint && npm test -- --run"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.5.0",
    "@commitlint/config-conventional": "^19.5.0",
    "concurrently": "^9.0.0",
    "husky": "^9.1.6",
    "lint-staged": "^15.2.10"
  }
}
