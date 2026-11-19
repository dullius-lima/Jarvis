import re, shutil

p = "src/services/orchestrator/motorInferencaLLM.ts"
shutil.copy(p, p + ".bak2")
s = open(p, encoding="utf-8").read()

s = re.sub(
    r"// __XML_HTTP200__[\s\S]*?return res;",
    "return await client.chat.completions.create(payload);",
    s,
    count=1
)

new_exec = r"""const chatApi = client.chat.completions;
    const res = await chatApi.create(payload);
    const m = res?.choices?.[0]?.message;
    const txt = typeof m?.content === 'string' ? m.content : '';
    if (txt.includes('<function=')) {
      const rx = new RegExp(
        '<function=([a-zA-Z0-9_.-]+)[>\\s]*' +
        '(\\{[\\s\\S]*?\\})?\\s*(?:</function>|$)',
        'g'
      );
      if (temTools && !m?.tool_calls?.length) {
        const calls: any[] = [];
        let hit: any;
        while ((hit = rx.exec(txt)) !== null) {
          let a = (hit[2] || '{}').trim().replace(/\\"/g, '"');
          try { JSON.parse(a); } catch { a = '{}'; }
          calls.push({
            id: 'call_' + Date.now() + '_' + calls.length,
            type: 'function',
            function: { name: hit[1].trim(), arguments: a }
          });
        }
        if (calls.length > 0) {
          m.tool_calls = calls;
          m.content = txt.replace(rx, '').trim();
        }
      } else if (!temTools) {
        m.content = txt.replace(rx, '').trim();
      }
    }
    return res;"""

pat = (
    r"return\s+await\s+client\.chat\."
    r"completions\.create\(\s*payload\s*\)\s*;"
)
s, n = re.subn(pat, new_exec, s, count=1)
assert n == 1, "Assinatura nao encontrada"

s = s.replace(
    "const rawArgs = (fnMatch[2] || '{}').trim();",
    r"""const rawArgs = (fnMatch[2] || '{}').trim().replace(/\\"/g, '"');"""
)

open(p, "w", encoding="utf-8").write(s)
print("OK: motorInferencaLLM.ts blindado!")
