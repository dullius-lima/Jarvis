import os from 'os';

export async function runInfraAgent() {
  console.log(`🛠️ [Agente de Infraestrutura e TI] Coletando métricas de saúde do sistema e servidores...`);

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemoryPercent = ((totalMemory - freeMemory) / totalMemory) * 100;
  
  const cpuLoad = os.loadavg();
  const uptimeHours = (os.uptime() / 3600).toFixed(2);

  let healthStatus = 'ESTÁVEL';
  if (usedMemoryPercent > 85 || cpuLoad[0] > 4.0) {
    healthStatus = 'ALERTA DE RECURSOS';
  }

  const infraReport = {
    sistemaOperacional: `${os.type()} ${os.release()} (${os.arch()})`,
    statusGeral: healthStatus,
    memoriaUsoPercentual: Number(usedMemoryPercent.toFixed(2)),
    cargaCPU1m: cpuLoad[0],
    uptimeHoras: Number(uptimeHours),
    servidoresAtivosOCI: 1,
    timestamp: new Date().toISOString()
  };

  return infraReport;
}