import * as winston from 'winston';
import { format, transports } from 'winston';
import 'winston-daily-rotate-file';

const timezoned = () => {
    return new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour12: false
    }).split(' ')[0]
}
class Log {
    private static appErrorInstance: winston.Logger;
    private static databaseErrorInstance: winston.Logger;
    private static appSuccessInstance: winston.Logger;
    private static clientName: string;

    public static setClientName(client: string): void {
        this.clientName = client;
        this.configureLoggers();
    }

    private static configureLoggers(): void {
        this.configureAppErrorInstance();
        this.configureDatabaseErrorInstance();
        this.configureAppSuccessInstance();
    }

    public static channel(file: string = 'application'): winston.Logger {
        if (file === 'database-error') {
            return this.databaseErrorInstance;
        }

        if (file === 'application-error') {
            return this.appErrorInstance;
        }

        return this.appSuccessInstance;
    }

    private static configureAppErrorInstance(): void {
        this.appErrorInstance = winston.createLogger({
            level: 'debug',
            format: format.combine(
                format.uncolorize(),
                format.timestamp({ format: timezoned }),
                format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaString}`;
                })
            ),
            transports: [
                new transports.DailyRotateFile({
                    filename: `clientes/${this.clientName}/logs/application-error-%DATE%.log`,
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '3d',
                })
            ]
        });
    }

    private static configureDatabaseErrorInstance(): void {
        this.databaseErrorInstance = winston.createLogger({
            level: 'debug',
            format: format.combine(
                format.uncolorize(),
                format.timestamp({ format: timezoned }),
                format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaString}`;
                })
            ),
            transports: [
                new transports.DailyRotateFile({
                    filename: `clientes/${this.clientName}/logs/database-error-%DATE%.log`,
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '3d',
                })
            ]
        });
    }

    private static configureAppSuccessInstance(): void {
        this.appSuccessInstance = winston.createLogger({
            level: 'debug',
            format: format.combine(
                format.uncolorize(),
                format.timestamp({ format: timezoned }),
                format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaString}`;
                })
            ),
            transports: [
                new transports.DailyRotateFile({
                    filename: `clientes/${this.clientName}/logs/application-%DATE%.log`,
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '3d',
                })
            ]
        });
    }

    public static debug(message: string, context: object = {}, file: string = 'application'): void {
        this.channel(file).debug(message, context);
    }

    public static info(message: string, context: object = {}, file: string = 'application'): void {
        this.channel(file).info(message, context);
    }

    public static notice(message: string, context: object = {}, file: string = 'application-error'): void {
        this.channel(file).notice(message, context);
    }

    public static warning(message: string, context: object = {}, file: string = 'application-error'): void {
        this.channel(file).warning(message, context);
    }

    public static error(message: string, context: object = {}, file: string = 'application-error'): void {
        this.channel(file).error(message, context);
    }

    public static alert(message: string, context: object = {}, file: string = 'application-error'): void {
        this.channel(file).alert(message, context);
    }

  
}

export default Log;
