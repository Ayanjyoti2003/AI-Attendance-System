from pygrabber.dshow_graph import FilterGraph

def test_pygrabber():
    try:
        graph = FilterGraph()
        devices = graph.get_input_devices()
        print("Connected Devices:")
        for idx, name in enumerate(devices):
            print(f"Index {idx}: {name}")
    except Exception as e:
        print("Error query devices:", e)

test_pygrabber()
