/* .gitignore snippets (based on the CC0 community templates) and short permissive licence texts. */
export const GITIGNORE: Record<string, string> = {
  Node: `# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.pnpm-store/
.npm/
.yarn/cache
.yarn/install-state.gz
dist/
build/
coverage/
.nyc_output/
*.tsbuildinfo
.eslintcache
.parcel-cache/
.turbo/`,
  'Next.js': `# Next.js
.next/
out/
next-env.d.ts
.vercel/`,
  Vite: `# Vite
dist/
dist-ssr/
*.local
.vite/`,
  Python: `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
dist/
*.egg-info/
.eggs/
.venv/
venv/
env/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
.tox/
.ipynb_checkpoints/
*.pyo`,
  Django: `# Django
*.log
local_settings.py
db.sqlite3
db.sqlite3-journal
media/
staticfiles/`,
  Java: `# Java
*.class
*.jar
*.war
*.ear
*.log
hs_err_pid*
target/
.gradle/
build/
out/`,
  Android: `# Android
*.apk
*.aab
*.ap_
.gradle/
local.properties
captures/
.externalNativeBuild/
.cxx/
*.keystore
*.jks`,
  Go: `# Go
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
go.work
vendor/
bin/`,
  Rust: `# Rust
target/
**/*.rs.bk
*.pdb`,
  'C / C++': `# C and C++
*.o
*.obj
*.a
*.lib
*.so
*.dylib
*.dll
*.exe
*.out
build/
cmake-build-*/
CMakeFiles/
CMakeCache.txt`,
  '.NET': `# .NET
bin/
obj/
*.user
*.suo
.vs/
*.nupkg
TestResults/`,
  PHP: `# PHP
vendor/
composer.phar
.phpunit.result.cache
*.cache`,
  Ruby: `# Ruby
*.gem
.bundle/
vendor/bundle/
log/
tmp/
coverage/
.byebug_history`,
  Flutter: `# Flutter and Dart
.dart_tool/
.packages
.flutter-plugins
.flutter-plugins-dependencies
build/
.pub-cache/
.pub/`,
  Swift: `# Swift and Xcode
.build/
DerivedData/
*.xcuserstate
xcuserdata/
*.ipa
*.dSYM.zip
Pods/`,
  Unity: `# Unity
[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
[Uu]ser[Ss]ettings/
*.csproj
*.sln
*.pidb
*.unityproj`,
  Terraform: `# Terraform
.terraform/
*.tfstate
*.tfstate.*
crash.log
*.tfvars
*.tfvars.json
override.tf
.terraformrc`,
  LaTeX: `# LaTeX
*.aux
*.bbl
*.blg
*.fdb_latexmk
*.fls
*.log
*.out
*.synctex.gz
*.toc
*.lof
*.lot`,
  'Jupyter / data': `# Notebooks and data
.ipynb_checkpoints/
*.parquet
*.h5
*.ckpt
data/raw/
wandb/
mlruns/`,
  Env: `# Secrets and local env
.env
.env.*
!.env.example
*.pem
*.key
secrets.*`,
  macOS: `# macOS
.DS_Store
.AppleDouble
.LSOverride
._*
.Spotlight-V100
.Trashes`,
  Windows: `# Windows
Thumbs.db
ehthumbs.db
Desktop.ini
$RECYCLE.BIN/
*.lnk`,
  Linux: `# Linux
*~
.fuse_hidden*
.directory
.Trash-*
.nfs*`,
  'VS Code': `# VS Code
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
*.code-workspace`,
  JetBrains: `# JetBrains IDEs
.idea/
*.iml
*.iws
out/`,
  Vim: `# Vim
*.swp
*.swo
*~
Session.vim
.netrwhist`,
}

export interface Licence { id: string; name: string; summary: string; text: (year: string, name: string) => string }

export const LICENCES: Licence[] = [
  { id: 'MIT', name: 'MIT License', summary: 'Do almost anything, keep the copyright notice. The most popular choice.', text: (y, n) => `MIT License

Copyright (c) ${y} ${n}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
` },
  { id: 'BSD-2-Clause', name: 'BSD 2-Clause License', summary: 'Like MIT, with the notice kept in source and binary forms.', text: (y, n) => `BSD 2-Clause License

Copyright (c) ${y}, ${n}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
` },
  { id: 'BSD-3-Clause', name: 'BSD 3-Clause License', summary: 'BSD 2-Clause plus: you may not use the author names to promote your product.', text: (y, n) => `BSD 3-Clause License

Copyright (c) ${y}, ${n}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
` },
  { id: 'ISC', name: 'ISC License', summary: 'A shorter MIT. Used by npm and OpenBSD.', text: (y, n) => `ISC License

Copyright (c) ${y} ${n}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
` },
  { id: '0BSD', name: 'Zero-Clause BSD', summary: 'Public-domain style: no notice needed at all.', text: (y, n) => `Zero-Clause BSD

Copyright (C) ${y} by ${n}

Permission to use, copy, modify, and/or distribute this software for
any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY
DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
` },
  { id: 'Unlicense', name: 'The Unlicense', summary: 'Gives the work to the public domain.', text: () => `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>
` },
  { id: 'Apache-2.0', name: 'Apache License 2.0 (notice)', summary: 'Permissive with a patent grant. This writes the standard notice; add the full text from apache.org.', text: (y, n) => `Copyright ${y} ${n}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
` },
  { id: 'GPL-3.0-or-later', name: 'GNU GPL v3 (notice)', summary: 'Copyleft: changes must stay open. This writes the standard notice; add the full text from gnu.org.', text: (y, n) => `Copyright (C) ${y} ${n}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
` },
]
