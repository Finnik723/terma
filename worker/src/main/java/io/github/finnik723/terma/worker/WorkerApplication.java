package io.github.finnik723.terma.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Import;
import io.github.finnik723.terma.storage.StorageConfiguration;

@SpringBootApplication
@Import(StorageConfiguration.class)
public class WorkerApplication {
    public static void main(String[] args) {
        // A finite bootstrap check, not a message consumer or scientific executor.
        try (var context = SpringApplication.run(WorkerApplication.class, args)) {
            if (!context.isActive()) throw new IllegalStateException("Worker context did not start.");
        }
        System.out.println("WORKER_BOOTSTRAP_OK; postgresql=MIGRATED; kafka=NOT_IMPLEMENTED; jobProcessing=NOT_IMPLEMENTED");
    }
}
