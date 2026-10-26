package io.github.finnik723.terma.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Import;
import io.github.finnik723.terma.storage.StorageConfiguration;

@SpringBootApplication
@Import(StorageConfiguration.class)
public class BackendApplication {
    public static void main(String[] args) {
        var application = new SpringApplication(BackendApplication.class);
        application.addInitializers(context -> {
            var environment = context.getEnvironment();
            var address = environment.getProperty("server.address", "127.0.0.1");
            if (!address.equals("127.0.0.1") && !address.equals("::1") && !address.equals("localhost")) {
                throw new IllegalArgumentException("SERVER_ADDRESS must be a loopback address for this scaffold.");
            }
            try {
                int port = Integer.parseInt(environment.getProperty("server.port", "8080"));
                if (port < 0 || port > 65535) throw new NumberFormatException();
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("SERVER_PORT must be 0..65535 (0 selects an ephemeral port).");
            }
        });
        application.run(args);
    }
}
