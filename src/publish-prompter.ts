import * as readline from 'readline/promises';
import { stdin, stdout } from 'process';

export interface PromptOption<T> {
  label: string;
  value: T;
}

export interface PublishPrompter {
  choose<T>(message: string, options: PromptOption<T>[]): Promise<T>;
  confirm(message: string): Promise<boolean>;
  input(message: string): Promise<string>;
  close(): void;
}

export class ConsolePublishPrompter implements PublishPrompter {
  private readonly terminal = readline.createInterface({ input: stdin, output: stdout });

  async choose<T>(message: string, options: PromptOption<T>[]): Promise<T> {
    if (options.length === 0) throw new Error('Cannot prompt without options');
    console.log(`\n${message}`);
    options.forEach((option, index) => console.log(`  ${index + 1}. ${option.label}`));

    while (true) {
      const answer = (await this.terminal.question('Choose an option: ')).trim();
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && options[index]) return options[index].value;
      console.log(`Enter a number from 1 to ${options.length}.`);
    }
  }

  async confirm(message: string): Promise<boolean> {
    const answer = (await this.terminal.question(`\n${message} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  }

  input(message: string): Promise<string> {
    return this.terminal.question(`\n${message} `);
  }

  close(): void {
    this.terminal.close();
  }
}
