+++
disableToc = false
title = "Shell Completion"
weight = 18
url = "/reference/shell-completion/"
+++

NeuroDesk provides shell completion support for **bash**, **zsh**, and **fish** shells. Once installed, tab completion works for all CLI commands, subcommands, and flags.

## Generating Completion Scripts

Use the `completion` subcommand to generate a completion script for your shell:

```bash
neurodesk completion bash
neurodesk completion zsh
neurodesk completion fish
```

## Installation

### Bash

Add the following to your `~/.bashrc`:

```bash
source <(neurodesk completion bash)
```

Or install it system-wide:

```bash
neurodesk completion bash > /etc/bash_completion.d/neurodesk
```

### Zsh

Add the following to your `~/.zshrc`:

```zsh
source <(neurodesk completion zsh)
```

Or install it to a completions directory:

```zsh
neurodesk completion zsh > "${fpath[1]}/_neurodesk"
```

If shell completions are not already enabled in your zsh environment, add the following to the beginning of your `~/.zshrc`:

```zsh
autoload -Uz compinit
compinit
```

### Fish

```fish
neurodesk completion fish | source
```

Or install it permanently:

```fish
neurodesk completion fish > ~/.config/fish/completions/neurodesk.fish
```

## Usage

After installation, restart your shell or source your shell configuration file. Then type `neurodesk` followed by a tab to see available commands:

```
$ neurodesk <TAB>
run              backends         completion       explorer         models
federated        sound-generation transcript       tts              util
```

Tab completion also works for subcommands and flags:

```
$ neurodesk models <TAB>
install  list

$ neurodesk run --<TAB>
--address          --backends-path    --context-size     --debug            ...
```
