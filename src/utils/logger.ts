interface ProcessInfo {
  id: string;
  name: string;
  description: string;
  startTime: number;
}

export class Logger {
  private static processes = new Map<string, ProcessInfo>();
  private static processCounter = 0;

  static info(component: string, message: string): void {
    console.log(`ℹ️  [${component}] ${message}`);
  }

  static success(component: string, message: string): void {
    console.log(`✅ [${component}] ${message}`);
  }

  static warning(component: string, message: string): void {
    console.warn(`⚠️  [${component}] ${message}`);
  }

  static error(component: string, message: string): void {
    console.error(`❌ [${component}] ${message}`);
  }

  static debug(component: string, message: string): void {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`🐛 [${component}] ${message}`);
    }
  }

  static startProcess(name: string, description: string): string {
    const id = `process_${++this.processCounter}`;
    const startTime = Date.now();
    
    this.processes.set(id, {
      id,
      name,
      description,
      startTime
    });

    console.log(`\n🔄 Starting: ${name}`);
    console.log(`   ${description}`);
    console.log(`   Process ID: ${id}`);
    
    return id;
  }

  static endProcess(processId: string, success: boolean, result: string): void {
    const process = this.processes.get(processId);
    
    if (!process) {
      this.warning('Logger', `Process ${processId} not found`);
      return;
    }

    const duration = Date.now() - process.startTime;
    const statusIcon = success ? '✅' : '❌';
    const statusText = success ? 'SUCCESS' : 'FAILED';
    
    console.log(`${statusIcon} ${statusText}: ${process.name} (${duration}ms)`);
    console.log(`   Result: ${result}`);
    console.log('   ' + '─'.repeat(50) + '\n');
    
    this.processes.delete(processId);
  }

  static logSeparator(title?: string): void {
    console.log('\n' + '═'.repeat(60));
    if (title) {
      console.log(`  ${title}`);
      console.log('═'.repeat(60));
    }
  }
}

export const logger = Logger;