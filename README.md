# taipy2 README

This is the README for your extension "taipy2". 

## Features
Autocomplete and suggestion of code, i.e. code completion with custom local hosted model API

## Requirements

A server API must be ready. 
Update this line 129 in the extension.js with your own API
    const apiUrl = 'https://aee0-103-253-89-37.ngrok-free.app/api/generate';

Instruction for server installation as follows:
- Build a local version of quantized, run the following command:

_"ct2-transformers-converter --model thanhnew2001/starcoder-7b-taipy5 --output_dir taipy5-ct2 --force --copy_files tokenizer.json tokenizer_config.json  special_tokens_map.json .gitattributes --quantization int8_float16 --trust_remote_code"_

- You will need at least 8GB VRAM to run this API
Run it: **python server_infer_ngrok_taipy.py**
Copy the ngrok generated API and replace the line 129 in the extension.

## Extension Settings

Nothing special needed

## Known Issues

Model needs more data for fine-tuning

## Release Notes
This is for testing and it works quite well

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---


## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
