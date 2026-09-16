package backend

import (
	"context"
	"fmt"

	"github.com/mudler/NeuroDesk/core/config"
	"github.com/mudler/NeuroDesk/pkg/grpc/proto"
	model "github.com/mudler/NeuroDesk/pkg/model"
)

func TokenMetrics(
	ctx context.Context,
	modelFile string,
	loader *model.ModelLoader,
	appConfig *config.ApplicationConfig,
	modelConfig config.ModelConfig) (*proto.MetricsResponse, error) {

	opts := ModelOptions(modelConfig, appConfig, model.WithModel(modelFile))
	model, err := loader.Load(opts...)
	if err != nil {
		recordModelLoadFailure(appConfig, modelConfig.Name, modelConfig.Backend, err, nil)
		return nil, err
	}

	if model == nil {
		return nil, fmt.Errorf("could not loadmodel model")
	}
	release, err := AcquireGlobalBackendSlot()
	if err != nil {
		return nil, err
	}
	defer release()

	res, err := model.GetTokenMetrics(ctx, &proto.MetricsRequest{})

	return res, err
}
