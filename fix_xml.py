import re, shutil

p = "src/services/orchestrator/motorInferencaLLM.ts"
shutil.copy(p, p + ".bak")
s = open(p, encoding="utf-8").read()

patch = r"""const chatApi = client.chat.completions;
    const res = await chatApi.create(payload);
    const m = res?.choices?.[0]?.message;
    const txt = m?.content || '';
    if (
      usarTools &&
      !m?.tool_calls?.length &&
      typeof txt === 'string' &&
      txt.includes('<function=')
    ) {
      const rx = new RegExp(
        '<function=([a-zA-Z0-9_.-]+)[>\\s]*' +
        '(\\{[\\s\\S]*?\\})?\\s*(?:</function>|$)',
        'g'
      );
      const calls: any[] = [];
      let hit: any;
      while ((hit = rx.exec(txt)) !== null) {
        let a = (hit[2] || '{}').trim();
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
    }
    return res;"""

pat = (
    r"return\s+await\s+client\.chat\."
    r"completions\.create\(\s*payload\s*\)\s*;"
)

if "__XML_HTTP200__" not in s:
    s2, n = re.subn(
        pat,
        "// __XML_HTTP200__\n    " + patch,
        s,
        count=1
    )
    assert n == 1, "Assinatura nao encontrada"
    open(p, "w", encoding="utf-8").write(s2)
    print("OK: motorInferencaLLM.ts atualizado!")
else:
    print("Ja aplicado.")
