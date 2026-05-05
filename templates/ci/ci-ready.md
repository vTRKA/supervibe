# CI Ready Notes

Base Genesis scaffolds do not assume a CI provider. Choose `github-actions` or `gitlab-ci` when a project is ready to commit a provider-specific pipeline.

Recommended checks:

- install dependencies from lockfiles;
- run the project test command;
- run lint/typecheck commands when the project defines them;
- keep secrets in provider settings, not in committed files;
- keep deploy jobs behind an explicit environment approval gate.
